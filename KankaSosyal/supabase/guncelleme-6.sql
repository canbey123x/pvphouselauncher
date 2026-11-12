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
