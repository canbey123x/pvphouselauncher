-- =========================================================
-- Kanka — Supabase veritabanı kurulumu
-- Supabase panelinde: SQL Editor → New query → bu dosyanın TAMAMINI yapıştır → Run.
-- İlk açılan hesap otomatik YÖNETİCİ (admin) olur ve mavi tik alır.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Tablolar ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  name text not null default '',
  bio text not null default '',
  avatar text not null default '',
  verified boolean not null default false,
  role text not null default 'user',          -- user | admin
  banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'photo',          -- photo | video
  media text not null default '',
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null default '',
  media text not null default '',
  media_kind text not null default '',         -- '' | photo | gif
  created_at timestamptz not null default now()
);

create table if not exists follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references profiles(id) on delete cascade,
  following_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id)
);

create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'photo',
  media text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, user_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references profiles(id) on delete cascade,
  b uuid not null references profiles(id) on delete cascade,
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  text text not null default '',
  media text not null default '',
  media_kind text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid not null references profiles(id) on delete cascade,
  type text not null,                          -- like | comment | follow | repost | message | verified | system
  post_id uuid,
  text text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null,                   -- post | comment | user | story
  target_id uuid not null,
  reason text not null default '',
  status text not null default 'open',         -- open | closed
  created_at timestamptz not null default now()
);

create table if not exists verify_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  note text not null default '',
  status text not null default 'open',         -- open | approved | rejected
  created_at timestamptz not null default now()
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Düzenleyici bilgisi (yazı/çıkartma katmanları, filtre, konum)
alter table posts add column if not exists meta jsonb not null default '{}'::jsonb;
alter table stories add column if not exists meta jsonb not null default '{}'::jsonb;

-- ---------- Yardımcı fonksiyonlar ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not banned);
$$;

-- Yeni kullanıcı → profil satırı. İlk kullanıcı admin + mavi tik.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  select not exists (select 1 from profiles where role = 'admin') into first;
  insert into profiles (id, username, name, verified, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'kullanici' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'name', ''),
    first,
    case when first then 'admin' else 'user' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Normal kullanıcı kendi mavi tikini / rolünü / banını değiştiremesin.
create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    new.verified := old.verified;
    new.role := old.role;
    new.banned := old.banned;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_trg on profiles;
create trigger protect_profile_trg before update on profiles
  for each row execute function protect_profile();

-- ---------- Satır güvenliği (RLS) ----------
alter table profiles enable row level security;
alter table posts enable row level security;
alter table likes enable row level security;
alter table reposts enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;
alter table stories enable row level security;
alter table story_views enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table notifications enable row level security;
alter table reports enable row level security;
alter table verify_requests enable row level security;
alter table announcements enable row level security;

do $$
declare t text;
begin
  -- herkese açık okunan tablolar
  foreach t in array array['profiles','posts','likes','reposts','comments','follows','stories','story_views','announcements'] loop
    execute format('drop policy if exists "read_%1$s" on %1$s', t);
    execute format('create policy "read_%1$s" on %1$s for select to authenticated using (true)', t);
  end loop;
end $$;

-- sahibine göre yazma kuralları (user_id sütunlu tablolar)
do $$
declare t text;
begin
  foreach t in array array['posts','likes','reposts','comments','stories','story_views','verify_requests'] loop
    execute format('drop policy if exists "ins_%1$s" on %1$s', t);
    execute format('create policy "ins_%1$s" on %1$s for insert to authenticated with check (user_id = auth.uid() and is_active())', t);
    execute format('drop policy if exists "upd_%1$s" on %1$s', t);
    execute format('create policy "upd_%1$s" on %1$s for update to authenticated using (user_id = auth.uid() or is_admin())', t);
    execute format('drop policy if exists "del_%1$s" on %1$s', t);
    execute format('create policy "del_%1$s" on %1$s for delete to authenticated using (user_id = auth.uid() or is_admin())', t);
  end loop;
end $$;

drop policy if exists "upd_profiles" on profiles;
create policy "upd_profiles" on profiles for update to authenticated using (id = auth.uid() or is_admin());
drop policy if exists "del_profiles" on profiles;
create policy "del_profiles" on profiles for delete to authenticated using (is_admin());

drop policy if exists "ins_follows" on follows;
create policy "ins_follows" on follows for insert to authenticated with check (follower_id = auth.uid() and is_active());
drop policy if exists "del_follows" on follows;
create policy "del_follows" on follows for delete to authenticated using (follower_id = auth.uid() or is_admin());

drop policy if exists "sel_conversations" on conversations;
create policy "sel_conversations" on conversations for select to authenticated using (auth.uid() in (a, b));
drop policy if exists "ins_conversations" on conversations;
create policy "ins_conversations" on conversations for insert to authenticated with check (auth.uid() in (a, b) and is_active());
drop policy if exists "upd_conversations" on conversations;
create policy "upd_conversations" on conversations for update to authenticated using (auth.uid() in (a, b));

drop policy if exists "sel_messages" on messages;
create policy "sel_messages" on messages for select to authenticated
  using (exists (select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)));
drop policy if exists "ins_messages" on messages;
create policy "ins_messages" on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_active() and exists (select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)));
drop policy if exists "del_messages" on messages;
create policy "del_messages" on messages for delete to authenticated using (sender_id = auth.uid());

drop policy if exists "sel_notifications" on notifications;
create policy "sel_notifications" on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "ins_notifications" on notifications;
create policy "ins_notifications" on notifications for insert to authenticated with check (actor_id = auth.uid());
drop policy if exists "upd_notifications" on notifications;
create policy "upd_notifications" on notifications for update to authenticated using (user_id = auth.uid());
drop policy if exists "del_notifications" on notifications;
create policy "del_notifications" on notifications for delete to authenticated using (user_id = auth.uid() or is_admin());

drop policy if exists "sel_reports" on reports;
create policy "sel_reports" on reports for select to authenticated using (reporter_id = auth.uid() or is_admin());
drop policy if exists "ins_reports" on reports;
create policy "ins_reports" on reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "upd_reports" on reports;
create policy "upd_reports" on reports for update to authenticated using (is_admin());
drop policy if exists "del_reports" on reports;
create policy "del_reports" on reports for delete to authenticated using (is_admin());

-- verify_requests: sahibi + admin okur
drop policy if exists "read_verify_requests" on verify_requests;
create policy "read_verify_requests" on verify_requests for select to authenticated using (user_id = auth.uid() or is_admin());

-- duyurular: sadece admin yazar
drop policy if exists "ins_announcements" on announcements;
create policy "ins_announcements" on announcements for insert to authenticated with check (is_admin() and user_id = auth.uid());
drop policy if exists "upd_announcements" on announcements;
create policy "upd_announcements" on announcements for update to authenticated using (is_admin());
drop policy if exists "del_announcements" on announcements;
create policy "del_announcements" on announcements for delete to authenticated using (is_admin());

-- ---------- Medya deposu (foto / video / gif) ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do update set public = true;

drop policy if exists "media_read" on storage.objects;
create policy "media_read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media_upload" on storage.objects;
create policy "media_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media_delete" on storage.objects;
create policy "media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

-- ===== guncelleme-2.sql =====
-- =========================================================
-- Kanka güncellemesi 2: güvenlik, gizlilik, yasak/kısıtlama, kurucu ve yönetici koruması,
-- engelleme, takip istekleri, mavi tik için yüz + yaş doğrulama, hesap silme.
-- Supabase > SQL Editor > New query > bu dosyanın TAMAMINI yapıştır > Run.
-- Birden fazla kez çalıştırmak zararsızdır.
-- =========================================================

-- ---------- Yeni sütunlar ----------
alter table profiles add column if not exists private boolean not null default false;
alter table profiles add column if not exists dm_policy text not null default 'everyone';   -- everyone | following | none
alter table profiles add column if not exists hide_likes boolean not null default false;
alter table profiles add column if not exists ban_reason text not null default '';
alter table profiles add column if not exists banned_until timestamptz;                     -- boş = süresiz
alter table profiles add column if not exists restricted boolean not null default false;
alter table profiles add column if not exists restrict_reason text not null default '';
alter table profiles add column if not exists restricted_until timestamptz;
alter table profiles add column if not exists moderated_by uuid;
alter table profiles add column if not exists moderated_at timestamptz;

alter table posts add column if not exists meta jsonb not null default '{}'::jsonb;
alter table stories add column if not exists meta jsonb not null default '{}'::jsonb;

alter table verify_requests add column if not exists full_name text not null default '';
alter table verify_requests add column if not exists birth_date date;
alter table verify_requests add column if not exists selfie text not null default '';
alter table verify_requests add column if not exists reject_reason text not null default '';
alter table verify_requests add column if not exists reviewed_by uuid;

-- ---------- Yeni tablolar ----------
create table if not exists follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (requester_id, target_id)
);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

-- Herkese açık olmayan kişisel bilgiler (doğum tarihi, sözleşme onayı)
create table if not exists private_info (
  user_id uuid primary key references profiles(id) on delete cascade,
  birth_date date,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table follow_requests enable row level security;
alter table blocks enable row level security;
alter table private_info enable row level security;

-- ---------- Roller: kurucu (owner) > yönetici (admin) > kullanıcı ----------
-- İlk yönetici kurucu olur (kimse onun rolünü değiştiremez, onu yasaklayamaz).
update profiles set role = 'owner'
where id = (select id from profiles where role in ('admin', 'owner') order by created_at limit 1)
  and not exists (select 1 from profiles where role = 'owner');

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'owner'));
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'owner');
$$;

-- Yasaklı ya da kısıtlı değil (süresi geçmiş yasak/kısıtlama sayılmaz)
create or replace function is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and not (banned and (banned_until is null or banned_until > now()))
      and not (restricted and (restricted_until is null or restricted_until > now()))
  );
$$;

-- İki kişiden biri diğerini engellemiş mi?
create or replace function is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- Bu kullanıcının içeriğini görebilir miyim? (gizli hesap + engelleme)
create or replace function can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid()
      or is_admin()
      or (
        not is_blocked_between(owner, auth.uid())
        and (
          not coalesce((select private from profiles where id = owner), false)
          or exists (select 1 from follows where follower_id = auth.uid() and following_id = owner)
        )
      );
$$;

-- Bu kişiye mesaj atabilir miyim?
create or replace function dm_allowed(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or is_admin()
      or (
        not is_blocked_between(target, auth.uid())
        and case coalesce((select dm_policy from profiles where id = target), 'everyone')
              when 'everyone' then true
              when 'following' then exists (select 1 from follows where follower_id = target and following_id = auth.uid())
              else false
            end
      );
$$;

create or replace function is_private(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select private from profiles where id = uid), false);
$$;

-- Yeni kullanıcı: ilk hesap kurucu olur
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first boolean;
begin
  select not exists (select 1 from profiles where role in ('admin', 'owner')) into first;
  insert into profiles (id, username, name, verified, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'kullanici' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'name', ''),
    first,
    case when first then 'owner' else 'user' end
  );
  return new;
end $$;

-- ---------- Profil koruması ----------
create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if not is_admin() then
    -- normal kullanıcı: kendi mavi tikini, rolünü, yasak ve kısıtlamasını değiştiremez
    new.verified := old.verified;
    new.role := old.role;
    new.banned := old.banned;
    new.ban_reason := old.ban_reason;
    new.banned_until := old.banned_until;
    new.restricted := old.restricted;
    new.restrict_reason := old.restrict_reason;
    new.restricted_until := old.restricted_until;
    new.moderated_by := old.moderated_by;
    new.moderated_at := old.moderated_at;
    return new;
  end if;
  -- kurucu hesabına sadece kurucunun kendisi dokunabilir
  if old.role = 'owner' and auth.uid() <> old.id then
    raise exception 'Kurucu hesabı değiştirilemez.';
  end if;
  -- yönetici hesaplarını sadece kurucu (ya da kendisi) düzenleyebilir
  if old.role = 'admin' and auth.uid() <> old.id and not is_owner() then
    raise exception 'Yönetici hesaplarını sadece kurucu düzenleyebilir.';
  end if;
  -- rol değişikliği sadece kurucuda; kurucu rolü devredilemez/kaldırılamaz
  if new.role is distinct from old.role then
    if not is_owner() then raise exception 'Yönetici yetkisini sadece kurucu verebilir veya alabilir.'; end if;
    if old.role = 'owner' or new.role = 'owner' then raise exception 'Kurucu rolü değiştirilemez.'; end if;
    if new.role not in ('user', 'admin') then raise exception 'Geçersiz rol.'; end if;
  end if;
  -- yöneticiler kısıtlanamaz / yasaklanamaz
  if old.role in ('admin', 'owner') and new.role in ('admin', 'owner') and (new.banned or new.restricted) then
    raise exception 'Yöneticiler kısıtlanamaz veya yasaklanamaz (yönetici koruması).';
  end if;
  if (new.banned is distinct from old.banned) or (new.restricted is distinct from old.restricted)
     or (new.ban_reason is distinct from old.ban_reason) or (new.restrict_reason is distinct from old.restrict_reason) then
    new.moderated_by := auth.uid();
    new.moderated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists protect_profile_trg on profiles;
create trigger protect_profile_trg before update on profiles
  for each row execute function protect_profile();

create or replace function protect_profile_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner' then raise exception 'Kurucu hesabı silinemez.'; end if;
  if old.role = 'admin' and auth.uid() <> old.id and not is_owner() then
    raise exception 'Yönetici hesaplarını sadece kurucu silebilir.';
  end if;
  return old;
end $$;

drop trigger if exists protect_profile_delete_trg on profiles;
create trigger protect_profile_delete_trg before delete on profiles
  for each row execute function protect_profile_delete();

-- Gönderide sadece açıklama ve düzenleyici bilgisi değişebilir
create or replace function protect_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.kind := old.kind;
  new.media := old.media;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists protect_post_trg on posts;
create trigger protect_post_trg before update on posts
  for each row execute function protect_post();

-- ---------- Satır güvenliği kuralları (yeniden) ----------
-- Gizli hesap ve engelleme: gönderi, hikâye ve yorumlar sadece görme izni olana
drop policy if exists "read_posts" on posts;
create policy "read_posts" on posts for select to authenticated using (can_view(user_id));
drop policy if exists "read_stories" on stories;
create policy "read_stories" on stories for select to authenticated using (can_view(user_id));
drop policy if exists "read_comments" on comments;
create policy "read_comments" on comments for select to authenticated
  using (exists (select 1 from posts p where p.id = post_id and can_view(p.user_id)));

-- Güncelleme izinleri: sadece gerekli olanlar
drop policy if exists "upd_posts" on posts;
create policy "upd_posts" on posts for update to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists "upd_likes" on likes;
drop policy if exists "upd_reposts" on reposts;
drop policy if exists "upd_comments" on comments;
drop policy if exists "upd_stories" on stories;
drop policy if exists "upd_story_views" on story_views;
drop policy if exists "upd_verify_requests" on verify_requests;
create policy "upd_verify_requests" on verify_requests for update to authenticated using (is_admin());

-- Ekleme: beğeni/yorum/repost sadece görebildiğin gönderiye
drop policy if exists "ins_likes" on likes;
create policy "ins_likes" on likes for insert to authenticated
  with check (user_id = auth.uid() and is_active() and exists (select 1 from posts p where p.id = post_id and can_view(p.user_id)));
drop policy if exists "ins_reposts" on reposts;
create policy "ins_reposts" on reposts for insert to authenticated
  with check (user_id = auth.uid() and is_active() and exists (select 1 from posts p where p.id = post_id and can_view(p.user_id) and not is_private(p.user_id)));
drop policy if exists "ins_comments" on comments;
create policy "ins_comments" on comments for insert to authenticated
  with check (user_id = auth.uid() and is_active() and exists (select 1 from posts p where p.id = post_id and can_view(p.user_id)));
drop policy if exists "ins_verify_requests" on verify_requests;
create policy "ins_verify_requests" on verify_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and reviewed_by is null);

-- Takip: gizli hesaba doğrudan takip yok, istek kabul edilince eklenir
drop policy if exists "ins_follows" on follows;
create policy "ins_follows" on follows for insert to authenticated with check (
  is_active() and (
    (follower_id = auth.uid() and following_id <> auth.uid() and not is_private(following_id) and not is_blocked_between(following_id, auth.uid()))
    or (following_id = auth.uid() and exists (select 1 from follow_requests r where r.requester_id = follower_id and r.target_id = auth.uid()))
  )
);
drop policy if exists "del_follows" on follows;
create policy "del_follows" on follows for delete to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid() or is_admin());

drop policy if exists "sel_follow_requests" on follow_requests;
create policy "sel_follow_requests" on follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid() or is_admin());
drop policy if exists "ins_follow_requests" on follow_requests;
create policy "ins_follow_requests" on follow_requests for insert to authenticated
  with check (requester_id = auth.uid() and target_id <> auth.uid() and is_active() and not is_blocked_between(target_id, auth.uid()));
drop policy if exists "del_follow_requests" on follow_requests;
create policy "del_follow_requests" on follow_requests for delete to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid() or is_admin());

-- Engelleme: sadece kendi engellediklerini görür/yönetir
drop policy if exists "sel_blocks" on blocks;
create policy "sel_blocks" on blocks for select to authenticated using (blocker_id = auth.uid() or is_admin());
drop policy if exists "ins_blocks" on blocks;
create policy "ins_blocks" on blocks for insert to authenticated with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
drop policy if exists "del_blocks" on blocks;
create policy "del_blocks" on blocks for delete to authenticated using (blocker_id = auth.uid());

-- Kişisel bilgiler: sadece sahibi ve yöneticiler
drop policy if exists "sel_private_info" on private_info;
create policy "sel_private_info" on private_info for select to authenticated using (user_id = auth.uid() or is_admin());
drop policy if exists "ins_private_info" on private_info;
create policy "ins_private_info" on private_info for insert to authenticated with check (user_id = auth.uid());

-- Mesajlar: mesaj izni ve engelleme kontrolü
drop policy if exists "ins_conversations" on conversations;
create policy "ins_conversations" on conversations for insert to authenticated
  with check (auth.uid() in (a, b) and is_active() and dm_allowed(case when a = auth.uid() then b else a end));
drop policy if exists "ins_messages" on messages;
create policy "ins_messages" on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_active() and exists (
    select 1 from conversations c where c.id = conversation_id and auth.uid() in (c.a, c.b)
      and dm_allowed(case when c.a = auth.uid() then c.b else c.a end)
  ));

-- Bildirimler: kullanıcılar sahte sistem/mavi tik bildirimi gönderemez
drop policy if exists "ins_notifications" on notifications;
create policy "ins_notifications" on notifications for insert to authenticated
  with check (actor_id = auth.uid() and (type in ('like', 'comment', 'follow', 'repost', 'message', 'follow_request', 'follow_accept') or is_admin()));

-- Şikâyet ve itiraz: her zaman "açık" olarak girilir
drop policy if exists "ins_reports" on reports;
create policy "ins_reports" on reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');

-- ---------- Hesap silme (Google Play şartı) ----------
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapılmamış.'; end if;
  if exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Kurucu hesabı silinemez. Önce Supabase panelinden başka birini kurucu yap.';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ---------- Medya deposu sınırları ve gizli doğrulama deposu ----------
update storage.buckets
set file_size_limit = 62914560,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp']
where id = 'media';

-- Mavi tik selfie'leri: herkese KAPALI depo, sadece sahibi ve yöneticiler
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verify', 'verify', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "verify_upload" on storage.objects;
create policy "verify_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'verify' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "verify_read" on storage.objects;
create policy "verify_read" on storage.objects for select to authenticated
  using (bucket_id = 'verify' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
drop policy if exists "verify_delete" on storage.objects;
create policy "verify_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'verify' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

notify pgrst, 'reload schema';

-- ===== guncelleme-3.sql =====
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

-- ===== guncelleme-6.sql =====
-- =========================================================
-- Kanka — güncelleme 6
-- Görüntülü arama, grup araması, mesaja yanıt ve tepki, tek seferlik fotoğraf,
-- kaybolan mesajlar, sohbet teması, kanallar, canlı yayın, yakındakiler,
-- anket gönderisi, yönetici istatistikleri.
-- Supabase > SQL Editor'de tamamını çalıştır. Tekrar çalıştırmak güvenlidir.
-- =========================================================

-- ---------- Görüntülü arama ----------
alter table calls add column if not exists kind text not null default 'audio'; -- audio | video

-- ---------- Grup araması ----------
create table if not exists group_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  started_by uuid not null references profiles(id) on delete cascade,
  kind text not null default 'audio',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists group_calls_conv on group_calls (conversation_id, created_at desc);
alter table group_calls enable row level security;

-- ---------- Mesaj: yanıt, tek seferlik medya ----------
alter table messages add column if not exists reply_to uuid references messages(id) on delete set null;
alter table messages add column if not exists once boolean not null default false;
alter table messages add column if not exists opened_at timestamptz;

create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null check (emoji in ('kalp', 'ates', 'kahkaha', 'sasirma', 'alkis', 'uzgun')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table message_reactions enable row level security;

-- ---------- Sohbet: kaybolan mesajlar, tema, kanal ----------
alter table conversations add column if not exists ttl_hours int;            -- null: kapalı, 24: 24 saatte kaybolur
alter table conversations add column if not exists theme text not null default '';
alter table conversations add column if not exists is_channel boolean not null default false;
alter table conversations add column if not exists description text not null default '';

-- ---------- Canlı yayın ----------
create table if not exists lives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists lives_open on lives (created_at desc) where ended_at is null;
alter table lives enable row level security;

-- ---------- Yakındakiler (yaklaşık konum, ~1 km) ----------
create table if not exists user_locations (
  user_id uuid primary key references profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);
alter table user_locations enable row level security;

-- ---------- Anket gönderisi ----------
create table if not exists post_votes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  choice int not null check (choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table post_votes enable row level security;

-- ---------- Yönetici istatistikleri: günlük aktiflik ----------
create table if not exists activity_days (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null default current_date,
  primary key (user_id, day)
);
alter table activity_days enable row level security;
alter table profiles add column if not exists invited_by uuid references profiles(id) on delete set null;

-- =========================================================
-- Fonksiyonlar
-- =========================================================
create or replace function is_channel_owner(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = conv and c.is_channel and c.owner_id = auth.uid());
$$;

-- Sohbet ayarları: üyeler sadece tema / kaybolma / ad / açıklama değiştirebilir
create or replace function protect_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.a := old.a; new.b := old.b; new.created_at := old.created_at;
  new.is_group := old.is_group; new.owner_id := old.owner_id; new.is_channel := old.is_channel;
  if old.is_channel and old.owner_id is distinct from auth.uid() then
    new.title := old.title; new.description := old.description; new.theme := old.theme; new.ttl_hours := old.ttl_hours;
  end if;
  if new.ttl_hours is not null and new.ttl_hours not in (1, 24, 168) then new.ttl_hours := 24; end if;
  return new;
end $$;
drop trigger if exists protect_conversation_trg on conversations;
create trigger protect_conversation_trg before update on conversations for each row execute function protect_conversation();

-- Mesajda sadece "açıldı" işareti değişebilir; tek seferlik medya açılınca silinir
create or replace function protect_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- yanıtlanan mesaj silinince bağlantı boşalır (veritabanının kendi işlemi)
  if new.reply_to is null and old.reply_to is not null and new.text = old.text and new.media = old.media then
    return new;
  end if;
  if old.opened_at is null and new.opened_at is not null and old.once and auth.uid() <> old.sender_id then
    new := old;
    new.opened_at := now();
    new.media := '';
    return new;
  end if;
  return old;
end $$;
drop trigger if exists protect_message_trg on messages;
create trigger protect_message_trg before update on messages for each row execute function protect_message();

-- Anket sonuçları (oy verenlerin kimliği gizli)
create or replace function post_poll_results(pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(choice, n) from (select choice, count(*) n from post_votes where post_id = pid group by choice) x), '{}'::jsonb),
    'mine', (select choice from post_votes where post_id = pid and user_id = auth.uid())
  )
  where exists (select 1 from posts p where p.id = pid and can_view(p.user_id));
$$;

-- Uygulama açıldıkça "bugün aktif" kaydı
create or replace function touch_seen() returns void
language sql security definer set search_path = public as $$
  insert into activity_days (user_id, day) values (auth.uid(), current_date) on conflict do nothing;
$$;
revoke execute on function touch_seen() from anon;

-- Yönetici paneli: son N gün
create or replace function admin_daily_stats(days int default 14) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then raise exception 'Yetkin yok.'; end if;
  days := least(greatest(days, 7), 90);
  select jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'active', (select count(*) from activity_days a where a.day = d::date),
        'signups', (select count(*) from profiles p where p.created_at::date = d::date),
        'posts', (select count(*) from posts p where p.created_at::date = d::date),
        'messages', (select count(*) from messages m where m.created_at::date = d::date)
      ) order by d)
      from generate_series(current_date - (days - 1), current_date, interval '1 day') d),
    'top', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select p.user_id, count(*) n from posts p where p.created_at > now() - interval '7 days'
        group by p.user_id order by n desc limit 5) t),
    'totals', jsonb_build_object(
        'users', (select count(*) from profiles),
        'active7', (select count(distinct user_id) from activity_days where day > current_date - 7),
        'posts', (select count(*) from posts),
        'messages', (select count(*) from messages))
  ) into r;
  return r;
end $$;

-- =========================================================
-- Kurallar (RLS)
-- =========================================================
-- grup araması
drop policy if exists "sel_group_calls" on group_calls;
create policy "sel_group_calls" on group_calls for select to authenticated using (is_member(conversation_id));
drop policy if exists "ins_group_calls" on group_calls;
create policy "ins_group_calls" on group_calls for insert to authenticated
  with check (started_by = auth.uid() and is_active() and is_member(conversation_id)
    and not exists (select 1 from conversations c where c.id = conversation_id and c.is_channel));
drop policy if exists "upd_group_calls" on group_calls;
create policy "upd_group_calls" on group_calls for update to authenticated using (is_member(conversation_id));

-- mesajlar: kaybolan mesajlar okunmaz; kanalda sadece sahibi yazar
drop policy if exists "sel_messages" on messages;
create policy "sel_messages" on messages for select to authenticated using (
  is_member(conversation_id) and not exists (
    select 1 from conversations c where c.id = conversation_id and c.ttl_hours is not null
      and messages.created_at < now() - make_interval(hours => c.ttl_hours)));
drop policy if exists "ins_messages" on messages;
create policy "ins_messages" on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_active() and is_member(conversation_id) and (
    exists (select 1 from conversations c where c.id = conversation_id and c.is_group and (not c.is_channel or c.owner_id = auth.uid()))
    or exists (select 1 from conversations c where c.id = conversation_id and not c.is_group and dm_allowed(case when c.a = auth.uid() then c.b else c.a end))
  ));
drop policy if exists "upd_messages" on messages;
create policy "upd_messages" on messages for update to authenticated using (is_member(conversation_id));

-- tepkiler
drop policy if exists "sel_reactions" on message_reactions;
create policy "sel_reactions" on message_reactions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and is_member(m.conversation_id)));
drop policy if exists "ins_reactions" on message_reactions;
create policy "ins_reactions" on message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from messages m where m.id = message_id and is_member(m.conversation_id)));
drop policy if exists "upd_reactions" on message_reactions;
create policy "upd_reactions" on message_reactions for update to authenticated using (user_id = auth.uid());
drop policy if exists "del_reactions" on message_reactions;
create policy "del_reactions" on message_reactions for delete to authenticated using (user_id = auth.uid());

-- kanallar: herkes görebilir ve katılabilir
drop policy if exists "sel_conversations" on conversations;
create policy "sel_conversations" on conversations for select to authenticated using (is_member(id) or is_channel);
drop policy if exists "ins_conversations" on conversations;
create policy "ins_conversations" on conversations for insert to authenticated with check (
  is_active() and (
    (not is_group and not is_channel and auth.uid() in (a, b) and dm_allowed(case when a = auth.uid() then b else a end))
    or (is_group and owner_id = auth.uid() and a = auth.uid() and b = auth.uid())
  )
);
drop policy if exists "sel_members" on conversation_members;
create policy "sel_members" on conversation_members for select to authenticated
  using (is_member(conversation_id) or exists (select 1 from conversations c where c.id = conversation_id and c.is_channel));
drop policy if exists "ins_members" on conversation_members;
create policy "ins_members" on conversation_members for insert to authenticated
  with check (
    (is_group_owner(conversation_id) and (user_id = auth.uid() or dm_allowed(user_id)))
    or (user_id = auth.uid() and exists (select 1 from conversations c where c.id = conversation_id and c.is_channel))
  );

-- canlı yayın
drop policy if exists "sel_lives" on lives;
create policy "sel_lives" on lives for select to authenticated using (can_view(user_id));
drop policy if exists "ins_lives" on lives;
create policy "ins_lives" on lives for insert to authenticated with check (user_id = auth.uid() and is_active());
drop policy if exists "upd_lives" on lives;
create policy "upd_lives" on lives for update to authenticated using (user_id = auth.uid() or is_admin());

-- konum: sadece konumunu paylaşanlar birbirini görür
drop policy if exists "sel_locations" on user_locations;
create policy "sel_locations" on user_locations for select to authenticated using (
  user_id = auth.uid() or (
    exists (select 1 from user_locations me where me.user_id = auth.uid())
    and not is_blocked_between(user_id, auth.uid())));
drop policy if exists "own_locations" on user_locations;
create policy "own_locations" on user_locations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- anket oyları
drop policy if exists "sel_votes" on post_votes;
create policy "sel_votes" on post_votes for select to authenticated using (user_id = auth.uid());
drop policy if exists "ins_votes" on post_votes;
create policy "ins_votes" on post_votes for insert to authenticated
  with check (user_id = auth.uid() and is_active() and exists (select 1 from posts p where p.id = post_id and can_view(p.user_id)));

-- aktiflik: sadece kendi kaydı (yönetici fonksiyonla okur)
drop policy if exists "own_activity" on activity_days;
create policy "own_activity" on activity_days for select to authenticated using (user_id = auth.uid());

-- bildirim türleri
drop policy if exists "ins_notifications" on notifications;
create policy "ins_notifications" on notifications for insert to authenticated
  with check (actor_id = auth.uid() and (type in ('like', 'comment', 'follow', 'repost', 'message', 'follow_request', 'follow_accept', 'tag', 'mention',
    'group_add', 'story_vote', 'missed_call', 'live', 'group_call', 'invite') or is_admin()));

-- canlı bildirim
do $$
declare t text;
begin
  foreach t in array array['group_calls', 'lives', 'message_reactions'] loop
    begin
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    exception when others then null;
    end;
  end loop;
end $$;

-- telefon bildirimi (guncelleme-4-bildirim.sql kuruluysa)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'push_hook') then
    execute 'drop trigger if exists push_group_calls on group_calls';
    execute 'create trigger push_group_calls after insert on group_calls for each row execute function push_hook()';
    execute 'drop trigger if exists push_lives on lives';
    execute 'create trigger push_lives after insert on lives for each row execute function push_hook()';
  end if;
end $$;

notify pgrst, 'reload schema';

-- ===== guncelleme-7-hiz.sql =====
-- =========================================================
-- Kanka — güncelleme 7: HIZ
-- Sık sorgulanan sütunlara dizin (index) ve tek istekte sayım yapan fonksiyonlar.
-- Supabase > SQL Editor'de tamamını çalıştır. Tekrar çalıştırmak güvenlidir.
-- =========================================================

-- ---------- Dizinler ----------
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_user_idx on posts (user_id, created_at desc);
create index if not exists posts_kind_idx on posts (kind, created_at desc);
create index if not exists likes_post_idx on likes (post_id);
create index if not exists likes_user_idx on likes (user_id, created_at desc);
create index if not exists reposts_post_idx on reposts (post_id);
create index if not exists reposts_user_idx on reposts (user_id, created_at desc);
create index if not exists comments_post_idx on comments (post_id, created_at);
create index if not exists comments_user_idx on comments (user_id, created_at desc);
create index if not exists follows_following_idx on follows (following_id);
create index if not exists stories_created_idx on stories (created_at desc);
create index if not exists stories_user_idx on stories (user_id, created_at desc);
create index if not exists story_views_user_idx on story_views (user_id);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists messages_conv_idx on messages (conversation_id, created_at desc);
create index if not exists conversations_a_idx on conversations (a);
create index if not exists conversations_b_idx on conversations (b);
create index if not exists conv_members_user_idx on conversation_members (user_id);
create index if not exists conv_reads_conv_idx on conversation_reads (conversation_id);
create index if not exists reactions_msg_idx on message_reactions (message_id);
create index if not exists post_views_post_idx on post_views (post_id);
create index if not exists saved_user_idx on saved_posts (user_id, created_at desc);
create index if not exists post_tags_user_idx on post_tags (user_id);
create index if not exists profiles_username_idx on profiles (username);

-- ---------- Gönderi sayıları: tek istekte (beğeni / repost / yorum, benim beğenim) ----------
create or replace function post_counts(ids uuid[])
returns table (post_id uuid, likes int, reposts int, comments int, liked boolean, reposted boolean)
language sql stable security definer set search_path = public as $$
  select p.id,
    (select count(*)::int from likes l where l.post_id = p.id),
    (select count(*)::int from reposts r where r.post_id = p.id),
    (select count(*)::int from comments c where c.post_id = p.id),
    exists (select 1 from likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists (select 1 from reposts r where r.post_id = p.id and r.user_id = auth.uid())
  from posts p
  where p.id = any(ids) and can_view(p.user_id);
$$;

-- ---------- Profil sayıları ----------
create or replace function profile_stats(uid uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posts', (select count(*) from posts where user_id = uid),
    'followers', (select count(*) from follows where following_id = uid),
    'following', (select count(*) from follows where follower_id = uid));
$$;

-- ---------- Mesaj kutusu: her sohbetin son mesajı (tek istek, okuma kuralları geçerli) ----------
create or replace function inbox_last(ids uuid[])
returns setof messages
language sql stable as $$
  select distinct on (conversation_id) *
  from messages
  where conversation_id = any(ids)
  order by conversation_id, created_at desc;
$$;

notify pgrst, 'reload schema';
