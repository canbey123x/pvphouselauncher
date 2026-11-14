<?php
// =========================================================
// Kanka API — tablo kuralları (Supabase'deki satır güvenliğinin karşılığı).
// read: hangi satırları görebilirim (SQL, tablo takma adı "t")
// insert / update / delete: izin + düzeltme (tetikleyicilerin karşılığı)
// İzin yoksa okuma ve silme sessizce boş döner, ekleme hata verir (Supabase ile aynı).
// =========================================================

const DENY = 'permission denied (row-level security)';
const NOTIF_TYPES = ['like', 'comment', 'follow', 'repost', 'message', 'follow_request', 'follow_accept', 'tag', 'mention', 'group_add', 'story_vote', 'missed_call', 'live', 'group_call', 'invite'];

/** Okuma kuralı: SQL parçası ya da null (tablo okunamaz). */
function rule_read(string $t): ?string
{
    $adm = is_admin() ? '1=1' : '1=0';
    switch ($t) {
        case 'profiles':
        case 'likes':
        case 'reposts':
        case 'follows':
        case 'story_views':
        case 'announcements':
            return '1=1';
        case 'posts':
        case 'highlights':
        case 'lives':
            return sql_can_view('t.user_id');
        case 'comments':
        case 'post_tags':
            return 'EXISTS (SELECT 1 FROM posts rp WHERE rp.id = t.post_id AND ' . sql_can_view('rp.user_id') . ')';
        case 'stories':
            $cf = al();
            return '(' . sql_can_view('t.user_id') . " AND (COALESCE(JSON_UNQUOTE(JSON_EXTRACT(t.meta, '$.audience')), '') <> 'close' OR t.user_id = :me OR $adm OR EXISTS (SELECT 1 FROM close_friends $cf WHERE $cf.owner_id = t.user_id AND $cf.friend_id = :me)))";
        case 'story_votes':
            return "(t.user_id = :me OR EXISTS (SELECT 1 FROM stories rs WHERE rs.id = t.story_id AND rs.user_id = :me))";
        case 'follow_requests':
            return "(t.requester_id = :me OR t.target_id = :me OR $adm)";
        case 'blocks':
            return "(t.blocker_id = :me OR $adm)";
        case 'close_friends':
            return 't.owner_id = :me';
        case 'conversations':
            return '(' . sql_is_member('t.id') . ' OR t.is_channel = 1)';
        case 'conversation_members':
            return '(' . sql_is_member('t.conversation_id') . ' OR EXISTS (SELECT 1 FROM conversations rc WHERE rc.id = t.conversation_id AND rc.is_channel = 1))';
        case 'conversation_reads':
        case 'group_calls':
            return sql_is_member('t.conversation_id');
        case 'messages':
            return '(' . sql_is_member('t.conversation_id') . ' AND NOT EXISTS (SELECT 1 FROM conversations rc WHERE rc.id = t.conversation_id AND rc.ttl_hours IS NOT NULL AND t.created_at < UTC_TIMESTAMP(3) - INTERVAL rc.ttl_hours HOUR))';
        case 'message_reactions':
            return 'EXISTS (SELECT 1 FROM messages rm WHERE rm.id = t.message_id AND ' . sql_is_member('rm.conversation_id') . ')';
        case 'notifications':
        case 'saved_posts':
        case 'post_votes':
        case 'device_tokens':
        case 'activity_days':
            return 't.user_id = :me';
        case 'reports':
            return "(t.reporter_id = :me OR $adm)";
        case 'verify_requests':
        case 'private_info':
            return "(t.user_id = :me OR $adm)";
        case 'post_views':
            return "(t.user_id = :me OR $adm OR EXISTS (SELECT 1 FROM posts rp WHERE rp.id = t.post_id AND rp.user_id = :me))";
        case 'calls':
            return '(t.caller_id = :me OR t.callee_id = :me)';
        case 'user_locations':
            return '(t.user_id = :me OR (EXISTS (SELECT 1 FROM user_locations ml WHERE ml.user_id = :me) AND NOT ' . sql_blocked('t.user_id') . '))';
    }
    return null;
}

/** Ekleme kuralı. $r düzeltilebilir. */
function rule_insert(string $t, array &$r): void
{
    global $ME;
    $own = fn($c) => ($r[$c] ?? null) === $ME;
    switch ($t) {
        case 'posts':
            if (!$own('user_id')) fail(DENY);
            need_active();
            if (!in_array($r['kind'] ?? 'photo', ['photo', 'video', 'gif', 'poll'], true)) $r['kind'] = 'photo';
            $r['caption'] = mb_substr((string) ($r['caption'] ?? ''), 0, 2200);
            return;
        case 'stories':
            if (!$own('user_id')) fail(DENY);
            need_active();
            return;
        case 'likes':
        case 'comments':
        case 'post_votes':
        case 'saved_posts':
        case 'post_views':
            if (!$own('user_id')) fail(DENY);
            if ($t !== 'saved_posts' && $t !== 'post_views') need_active();
            $o = qv('SELECT user_id FROM posts WHERE id = ?', [$r['post_id'] ?? '']);
            if (!$o || !can_view($o)) fail(DENY);
            if ($t === 'post_votes' && ((int) ($r['choice'] ?? -1) < 0 || (int) $r['choice'] > 3)) fail('Geçersiz seçenek');
            if ($t === 'comments') $r['text'] = mb_substr((string) ($r['text'] ?? ''), 0, 1000);
            return;
        case 'reposts':
            if (!$own('user_id')) fail(DENY);
            need_active();
            $p = q1('SELECT p.user_id, pr.private FROM posts p JOIN profiles pr ON pr.id = p.user_id WHERE p.id = ?', [$r['post_id'] ?? '']);
            if (!$p || !can_view($p['user_id']) || (int) $p['private'] || $p['user_id'] === $ME) fail(DENY);
            return;
        case 'story_views':
            if (!$own('user_id')) fail(DENY);
            return;
        case 'story_votes':
            if (!$own('user_id')) fail(DENY);
            need_active();
            $o = qv('SELECT user_id FROM stories WHERE id = ?', [$r['story_id'] ?? '']);
            if (!$o || !can_view($o)) fail(DENY);
            return;
        case 'highlights':
            if (!$own('user_id')) fail(DENY);
            need_active();
            return;
        case 'follows':
            need_active();
            $f = $r['follower_id'] ?? '';
            $g = $r['following_id'] ?? '';
            if ($f === $ME && $g !== $ME) {
                $priv = (int) qv('SELECT private FROM profiles WHERE id = ?', [$g]);
                if ($priv || blocked_between($g)) fail(DENY);
                return;
            }
            // gizli hesap: isteği kabul eden kişi takipçi satırını ekler
            if ($g === $ME && qv('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?', [$f, $ME])) return;
            fail(DENY);
        case 'follow_requests':
            if (!$own('requester_id') || ($r['target_id'] ?? '') === $ME) fail(DENY);
            need_active();
            if (blocked_between($r['target_id'])) fail(DENY);
            return;
        case 'blocks':
            if (!$own('blocker_id') || ($r['blocked_id'] ?? '') === $ME) fail(DENY);
            return;
        case 'close_friends':
            if (!$own('owner_id') || ($r['friend_id'] ?? '') === $ME) fail(DENY);
            return;
        case 'conversations':
            need_active();
            $grp = !empty($r['is_group']);
            if (!$grp) {
                if (!empty($r['is_channel']) || !in_array($ME, [$r['a'] ?? '', $r['b'] ?? ''], true)) fail(DENY);
                $other = $r['a'] === $ME ? $r['b'] : $r['a'];
                if (!dm_allowed($other)) fail(DENY);
                if (qv('SELECT 1 FROM conversations WHERE is_group = 0 AND ((a = ? AND b = ?) OR (a = ? AND b = ?))', [$r['a'], $r['b'], $r['b'], $r['a']])) fail('duplicate key: conversation');
                return;
            }
            if (($r['owner_id'] ?? '') !== $ME || $r['a'] !== $ME || $r['b'] !== $ME) fail(DENY);
            $r['title'] = mb_substr((string) ($r['title'] ?? ''), 0, 40);
            return;
        case 'conversation_members':
            $c = q1('SELECT * FROM conversations WHERE id = ?', [$r['conversation_id'] ?? '']);
            if (!$c) fail(DENY);
            $groupOwner = (int) $c['is_group'] && $c['owner_id'] === $ME;
            if ($groupOwner && (($r['user_id'] ?? '') === $ME || dm_allowed($r['user_id']))) return;
            if ($own('user_id') && (int) $c['is_channel']) return;
            fail(DENY);
        case 'conversation_reads':
            if (!$own('user_id') || !is_member($r['conversation_id'] ?? '')) fail(DENY);
            return;
        case 'messages':
            if (!$own('sender_id')) fail(DENY);
            need_active();
            $c = q1('SELECT * FROM conversations WHERE id = ?', [$r['conversation_id'] ?? '']);
            if (!$c || !is_member($c['id'])) fail(DENY);
            if ((int) $c['is_group']) {
                if ((int) $c['is_channel'] && $c['owner_id'] !== $ME) fail(DENY);
            } elseif (!dm_allowed($c['a'] === $ME ? $c['b'] : $c['a'])) fail(DENY);
            $r['text'] = mb_substr((string) ($r['text'] ?? ''), 0, 4000);
            $r['opened_at'] = null;
            return;
        case 'message_reactions':
            if (!$own('user_id') || !in_array($r['emoji'] ?? '', ['kalp', 'ates', 'kahkaha', 'sasirma', 'alkis', 'uzgun'], true)) fail(DENY);
            $cv = qv('SELECT conversation_id FROM messages WHERE id = ?', [$r['message_id'] ?? '']);
            if (!$cv || !is_member($cv)) fail(DENY);
            return;
        case 'notifications':
            if (!$own('actor_id')) fail(DENY);
            if (!in_array($r['type'] ?? '', NOTIF_TYPES, true) && !is_admin()) fail(DENY);
            $r['read'] = 0;
            $r['text'] = mb_substr((string) ($r['text'] ?? ''), 0, 400);
            return;
        case 'reports':
            if (!$own('reporter_id')) fail(DENY);
            $r['status'] = 'open';
            return;
        case 'verify_requests':
            if (!$own('user_id')) fail(DENY);
            $r['status'] = 'open';
            $r['reviewed_by'] = null;
            return;
        case 'announcements':
            if (!is_admin() || !$own('user_id')) fail(DENY);
            return;
        case 'private_info':
            if (!$own('user_id')) fail(DENY);
            return;
        case 'post_tags':
            $o = qv('SELECT user_id FROM posts WHERE id = ?', [$r['post_id'] ?? '']);
            if ($o !== $ME || blocked_between($r['user_id'] ?? '')) fail(DENY);
            return;
        case 'device_tokens':
        case 'user_locations':
            if (!$own('user_id')) fail(DENY);
            return;
        case 'calls':
            guard_call_insert($r);
            return;
        case 'group_calls':
            if (!$own('started_by')) fail(DENY);
            need_active();
            $c = q1('SELECT is_channel FROM conversations WHERE id = ?', [$r['conversation_id'] ?? '']);
            if (!$c || (int) $c['is_channel'] || !is_member($r['conversation_id'])) fail(DENY);
            $r['ended_at'] = null;
            return;
        case 'lives':
            if (!$own('user_id')) fail(DENY);
            need_active();
            $r['ended_at'] = null;
            return;
    }
    fail(DENY);
}

/** Güncelleme kuralı: $old satırına $new uygulanır; izin yoksa false. */
function rule_update(string $t, array $old, array &$new): bool
{
    global $ME;
    $keep = function (array $cols) use ($old, &$new) {
        foreach ($cols as $c) if (array_key_exists($c, $old)) $new[$c] = $old[$c];
    };
    $only = function (array $cols) use ($old, &$new) {
        foreach (array_keys($new) as $c) if (!in_array($c, $cols, true)) $new[$c] = $old[$c] ?? null;
    };
    switch ($t) {
        case 'profiles':
            if ($old['id'] !== $ME && !is_admin()) return false;
            protect_profile($old, $new);
            return true;
        case 'posts':
            if ($old['user_id'] !== $ME && !is_admin()) return false;
            $only(['caption', 'meta']);
            return true;
        case 'highlights':
            if ($old['user_id'] !== $ME) return false;
            $only(['title', 'cover', 'story_ids']);
            return true;
        case 'conversations':
            if (!is_member($old['id'])) return false;
            $keep(['id', 'a', 'b', 'created_at', 'is_group', 'owner_id', 'is_channel']);
            if ((int) $old['is_channel'] && $old['owner_id'] !== $ME) $only(['last_at']);
            if ($new['ttl_hours'] !== null && !in_array((int) $new['ttl_hours'], [1, 24, 168], true)) $new['ttl_hours'] = 24;
            return true;
        case 'conversation_reads':
            if ($old['user_id'] !== $ME) return false;
            $only(['last_read_at', 'typing_at']);
            return true;
        case 'messages':
            if (!is_member($old['conversation_id'])) return false;
            // sadece tek seferlik medyanın "açıldı" işareti; açılınca medya silinir
            if ((int) $old['once'] && $old['opened_at'] === null && !empty($new['opened_at']) && $old['sender_id'] !== $ME) {
                $only([]);
                $new['opened_at'] = now_db();
                $new['media'] = '';
                return true;
            }
            return false;
        case 'message_reactions':
            if ($old['user_id'] !== $ME) return false;
            $only(['emoji']);
            return in_array($new['emoji'], ['kalp', 'ates', 'kahkaha', 'sasirma', 'alkis', 'uzgun'], true);
        case 'notifications':
            if ($old['user_id'] !== $ME) return false;
            $only(['read']);
            return true;
        case 'reports':
        case 'verify_requests':
            if (!is_admin()) return false;
            $only(['status', 'reject_reason', 'reviewed_by']);
            return true;
        case 'announcements':
            if (!is_admin()) return false;
            $only(['active', 'text']);
            return true;
        case 'private_info':
            if ($old['user_id'] !== $ME) return false;
            $only(['birth_date', 'terms_accepted_at']);
            return true;
        case 'device_tokens':
        case 'user_locations':
            if ($old['user_id'] !== $ME) return false;
            $keep(['user_id']);
            return true;
        case 'calls':
            if (!in_array($ME, [$old['caller_id'], $old['callee_id']], true)) return false;
            guard_call_update($old, $new);
            return true;
        case 'group_calls':
            if (!is_member($old['conversation_id'])) return false;
            $only(['ended_at']);
            return true;
        case 'lives':
            if ($old['user_id'] !== $ME && !is_admin()) return false;
            $only(['ended_at', 'title']);
            return true;
    }
    return false;
}

/** Silme kuralı. */
function rule_delete(string $t, array $o): bool
{
    global $ME;
    $adm = is_admin();
    switch ($t) {
        case 'posts':
        case 'likes':
        case 'reposts':
        case 'stories':
        case 'story_views':
        case 'highlights':
        case 'verify_requests':
            return $o['user_id'] === $ME || $adm;
        case 'comments':
            return $o['user_id'] === $ME || $adm || qv('SELECT user_id FROM posts WHERE id = ?', [$o['post_id']]) === $ME;
        case 'saved_posts':
        case 'device_tokens':
        case 'user_locations':
        case 'message_reactions':
            return $o['user_id'] === $ME;
        case 'notifications':
            return $o['user_id'] === $ME || $adm;
        case 'follows':
            return $o['follower_id'] === $ME || $o['following_id'] === $ME || $adm;
        case 'follow_requests':
            return $o['requester_id'] === $ME || $o['target_id'] === $ME || $adm;
        case 'blocks':
            return $o['blocker_id'] === $ME;
        case 'close_friends':
            return $o['owner_id'] === $ME;
        case 'conversations':
            return (int) $o['is_group'] && $o['owner_id'] === $ME;
        case 'conversation_members':
            return $o['user_id'] === $ME || (bool) qv('SELECT 1 FROM conversations WHERE id = ? AND is_group = 1 AND owner_id = ?', [$o['conversation_id'], $ME]);
        case 'messages':
            return $o['sender_id'] === $ME || (bool) qv('SELECT 1 FROM conversations WHERE id = ? AND is_channel = 1 AND owner_id = ?', [$o['conversation_id'], $ME]);
        case 'post_tags':
            return $o['user_id'] === $ME || $adm || qv('SELECT user_id FROM posts WHERE id = ?', [$o['post_id']]) === $ME;
        case 'reports':
        case 'announcements':
            return $adm;
        case 'profiles':
            if (!$adm) return false;
            if ($o['role'] === 'owner') fail('Kurucu hesabı silinemez.');
            if ($o['role'] === 'admin' && $o['id'] !== $ME && !is_owner()) fail('Yönetici hesaplarını sadece kurucu silebilir.');
            return true;
    }
    return false;
}

/* ---------- Tetikleyici karşılıkları ---------- */
function protect_profile(array $old, array &$new): void
{
    global $ME;
    $new['id'] = $old['id'];
    $new['created_at'] = $old['created_at'];
    $mod = ['verified', 'role', 'banned', 'ban_reason', 'banned_until', 'restricted', 'restrict_reason', 'restricted_until', 'moderated_by', 'moderated_at'];
    if (isset($new['username']) && $new['username'] !== $old['username']) {
        $u = strtolower(preg_replace('/[^a-z0-9_.]/i', '', (string) $new['username']));
        if (strlen($u) < 3) fail('Kullanıcı adı en az 3 karakter olmalı.');
        if (qv('SELECT 1 FROM profiles WHERE username = ? AND id <> ?', [$u, $old['id']])) fail('Bu kullanıcı adı alınmış.');
        $new['username'] = $u;
    }
    if (!is_admin()) {
        foreach ($mod as $c) $new[$c] = $old[$c];
        return;
    }
    if ($old['role'] === 'owner' && $ME !== $old['id']) fail('Kurucu hesabı değiştirilemez.');
    if ($old['role'] === 'admin' && $ME !== $old['id'] && !is_owner()) fail('Yönetici hesaplarını sadece kurucu düzenleyebilir.');
    if ($new['role'] !== $old['role']) {
        if (!is_owner()) fail('Yönetici yetkisini sadece kurucu verebilir veya alabilir.');
        if ($old['role'] === 'owner' || $new['role'] === 'owner') fail('Kurucu rolü değiştirilemez.');
        if (!in_array($new['role'], ['user', 'admin'], true)) fail('Geçersiz rol.');
    }
    if (in_array($old['role'], ['admin', 'owner'], true) && in_array($new['role'], ['admin', 'owner'], true) && ((int) $new['banned'] || (int) $new['restricted'])) {
        fail('Yöneticiler kısıtlanamaz veya yasaklanamaz (yönetici koruması).');
    }
    foreach (['banned', 'restricted', 'ban_reason', 'restrict_reason'] as $c) {
        if ((string) $new[$c] !== (string) $old[$c]) {
            $new['moderated_by'] = $ME;
            $new['moderated_at'] = now_db();
            break;
        }
    }
}

function guard_call_insert(array &$r): void
{
    global $ME, $MEP;
    $r['caller_id'] = $ME;
    $r['status'] = 'ringing';
    $r['answered_at'] = null;
    $r['ended_at'] = null;
    $r['kind'] = ($r['kind'] ?? '') === 'video' ? 'video' : 'audio';
    $to = $r['callee_id'] ?? '';
    if ($to === $ME) fail('Kendini arayamazsın.');
    if (!is_active()) fail('Hesabın kısıtlı ya da yasaklı; arama yapamazsın.');
    if (blocked_between($to)) fail('Bu kişiyi arayamazsın.');
    $pol = qv('SELECT call_policy FROM profiles WHERE id = ?', [$to]);
    if ($pol === null) fail('Kullanıcı bulunamadı.');
    $followsMe = (bool) qv('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [$to, $ME]);
    if ($pol === 'none') fail('Bu kişi arama kabul etmiyor.');
    if ($pol === 'following' && !$followsMe) fail('Bu kişi sadece takip ettiği kişilerden arama kabul ediyor.');
    // spam koruması
    if (qv("SELECT 1 FROM calls WHERE caller_id = ? AND status IN ('ringing','accepted') AND created_at > UTC_TIMESTAMP(3) - INTERVAL 60 SECOND", [$ME])) fail('Zaten devam eden bir araman var.');
    if ((int) qv('SELECT COUNT(*) FROM calls WHERE caller_id = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE', [$ME]) >= 6) fail('Çok fazla arama yaptın. Biraz bekleyip tekrar dene.');
    if ((int) qv("SELECT COUNT(*) FROM calls WHERE caller_id = ? AND callee_id = ? AND status IN ('ringing','missed','declined','cancelled') AND created_at > UTC_TIMESTAMP(3) - INTERVAL 1 HOUR", [$ME, $to]) >= 3) {
        fail('Bu kişiyi son bir saatte çok sık aradın ve cevap vermedi. Daha sonra tekrar dene.');
    }
    if ((int) qv('SELECT COUNT(*) FROM calls WHERE caller_id = ? AND created_at > UTC_TIMESTAMP(3) - INTERVAL 1 DAY', [$ME]) >= 40) fail('Günlük arama sınırına ulaştın.');
    if (strtotime($MEP['created_at'] . ' UTC') > time() - 86400 && !$followsMe) fail('Yeni hesaplar ilk 24 saat sadece kendilerini takip eden kişileri arayabilir.');
}
function guard_call_update(array $old, array &$new): void
{
    global $ME;
    foreach (['id', 'caller_id', 'callee_id', 'created_at', 'kind'] as $c) $new[$c] = $old[$c];
    if (in_array($old['status'], ['declined', 'missed', 'cancelled', 'ended'], true)) fail('Bu arama bitti.');
    $s = $new['status'];
    if ($s === $old['status']) return;
    if ($s === 'accepted') {
        if ($ME !== $old['callee_id'] || $old['status'] !== 'ringing') fail('Aramayı sadece aranan kişi açabilir.');
        $new['answered_at'] = now_db();
    } elseif ($s === 'declined') {
        if ($ME !== $old['callee_id']) fail('Geçersiz.');
        $new['ended_at'] = now_db();
    } elseif (in_array($s, ['cancelled', 'missed'], true)) {
        if ($old['status'] !== 'ringing') fail('Geçersiz.');
        $new['ended_at'] = now_db();
    } elseif ($s === 'ended') {
        $new['ended_at'] = now_db();
    } else fail('Geçersiz arama durumu.');
}
