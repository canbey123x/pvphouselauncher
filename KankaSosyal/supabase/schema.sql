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
