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
