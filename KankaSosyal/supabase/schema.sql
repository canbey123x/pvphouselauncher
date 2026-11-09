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
