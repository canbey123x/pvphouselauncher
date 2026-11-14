<?php
// =========================================================
// Kanka API — sunucu fonksiyonları (uygulamadaki db.rpc)
// =========================================================

function op_rpc(string $name, array $a)
{
    global $ME;
    if ($name === 'decline_call') return rpc_decline_call((string) ($a['cid'] ?? ''));
    need_auth();
    switch ($name) {
        case 'post_counts':
            return rpc_post_counts((array) ($a['ids'] ?? []));
        case 'profile_stats':
            $u = (string) ($a['uid'] ?? '');
            return [
                'posts' => (int) qv('SELECT COUNT(*) FROM posts WHERE user_id = ?', [$u]),
                'followers' => (int) qv('SELECT COUNT(*) FROM follows WHERE following_id = ?', [$u]),
                'following' => (int) qv('SELECT COUNT(*) FROM follows WHERE follower_id = ?', [$u]),
            ];
        case 'inbox_last':
            return rpc_inbox_last((array) ($a['ids'] ?? []));
        case 'post_insights':
            return rpc_post_insights((string) ($a['pid'] ?? ''));
        case 'story_poll_results':
            $sid = (string) ($a['sid'] ?? '');
            $o = qv('SELECT user_id FROM stories WHERE id = ?', [$sid]);
            if (!$o || !can_view($o)) return null;
            return [
                'a' => (int) qv("SELECT COUNT(*) FROM story_votes WHERE story_id = ? AND choice = 'a'", [$sid]),
                'b' => (int) qv("SELECT COUNT(*) FROM story_votes WHERE story_id = ? AND choice = 'b'", [$sid]),
                'mine' => qv('SELECT choice FROM story_votes WHERE story_id = ? AND user_id = ?', [$sid, $ME]),
            ];
        case 'post_poll_results':
            $pid = (string) ($a['pid'] ?? '');
            $o = qv('SELECT user_id FROM posts WHERE id = ?', [$pid]);
            if (!$o || !can_view($o)) return null;
            $counts = new stdClass();
            foreach (q('SELECT choice, COUNT(*) n FROM post_votes WHERE post_id = ? GROUP BY choice', [$pid])->fetchAll() as $r) $counts->{$r['choice']} = (int) $r['n'];
            $mine = qv('SELECT choice FROM post_votes WHERE post_id = ? AND user_id = ?', [$pid, $ME]);
            return ['counts' => $counts, 'mine' => $mine === null ? null : (int) $mine];
        case 'register_device':
            $tok = substr((string) ($a['tok'] ?? ''), 0, 255);
            if ($tok === '') return null;
            q('INSERT INTO device_tokens (token, user_id, platform, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = VALUES(updated_at)', [$tok, $ME, 'android', now_db()]);
            return null;
        case 'unregister_device':
            q('DELETE FROM device_tokens WHERE token = ? AND user_id = ?', [(string) ($a['tok'] ?? ''), $ME]);
            return null;
        case 'touch_seen':
            q('INSERT IGNORE INTO activity_days (user_id, day) VALUES (?, UTC_DATE())', [$ME]);
            return null;
        case 'admin_daily_stats':
            return rpc_admin_stats((int) ($a['days'] ?? 14));
    }
    fail('Bilinmeyen işlem: ' . $name);
}

function rpc_post_counts(array $ids): array
{
    global $ME;
    $ids = array_values(array_filter(array_unique($ids), 'is_uuid'));
    if (!$ids) return [];
    $ids = array_slice($ids, 0, 400);
    $in = implode(',', array_map(fn($x) => db()->quote($x), $ids));
    $vis = q("SELECT t.id FROM posts t WHERE t.id IN ($in) AND (" . sql_can_view('t.user_id') . ')')->fetchAll(PDO::FETCH_COLUMN);
    if (!$vis) return [];
    $in = implode(',', array_map(fn($x) => db()->quote($x), $vis));
    $cnt = fn($tbl) => array_column(q("SELECT post_id, COUNT(*) n FROM $tbl WHERE post_id IN ($in) GROUP BY post_id")->fetchAll(), 'n', 'post_id');
    $mine = fn($tbl) => array_flip(q("SELECT post_id FROM $tbl WHERE post_id IN ($in) AND user_id = ?", [$ME])->fetchAll(PDO::FETCH_COLUMN));
    [$l, $r, $c, $ml, $mr] = [$cnt('likes'), $cnt('reposts'), $cnt('comments'), $mine('likes'), $mine('reposts')];
    $out = [];
    foreach ($vis as $id) {
        $out[] = ['post_id' => $id, 'likes' => (int) ($l[$id] ?? 0), 'reposts' => (int) ($r[$id] ?? 0), 'comments' => (int) ($c[$id] ?? 0), 'liked' => isset($ml[$id]), 'reposted' => isset($mr[$id])];
    }
    return $out;
}

function rpc_inbox_last(array $ids): array
{
    $ids = array_values(array_filter(array_unique($ids), 'is_uuid'));
    if (!$ids) return [];
    $in = implode(',', array_map(fn($x) => db()->quote($x), array_slice($ids, 0, 300)));
    $read = rule_read('messages');
    $rows = q("SELECT t.* FROM messages t WHERE t.conversation_id IN ($in) AND ($read)
      AND t.created_at = (SELECT MAX(x.created_at) FROM messages x WHERE x.conversation_id = t.conversation_id)")->fetchAll();
    $seen = [];
    $out = [];
    foreach ($rows as $r) {
        if (isset($seen[$r['conversation_id']])) continue;
        $seen[$r['conversation_id']] = 1;
        $out[] = out_row($r);
    }
    return $out;
}

function rpc_post_insights(string $pid)
{
    global $ME;
    $o = qv('SELECT user_id FROM posts WHERE id = ?', [$pid]);
    if (!$o || ($o !== $ME && !is_admin())) fail('Bu istatistikleri sadece gönderinin sahibi görebilir.');
    $c = fn($sql) => (int) qv($sql, [$pid]);
    return [
        'views' => $c('SELECT COUNT(*) FROM post_views WHERE post_id = ?'),
        'follower_views' => (int) qv('SELECT COUNT(*) FROM post_views v WHERE v.post_id = ? AND EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = v.user_id AND f.following_id = ?)', [$pid, $o]),
        'saves' => $c('SELECT COUNT(*) FROM saved_posts WHERE post_id = ?'),
        'likes' => $c('SELECT COUNT(*) FROM likes WHERE post_id = ?'),
        'comments' => $c('SELECT COUNT(*) FROM comments WHERE post_id = ?'),
        'reposts' => $c('SELECT COUNT(*) FROM reposts WHERE post_id = ?'),
        'shares' => 0,
    ];
}

function rpc_admin_stats(int $days): array
{
    if (!is_admin()) fail('Yetkin yok.');
    $days = min(max($days, 7), 90);
    $by = function ($sql) {
        return array_column(q($sql)->fetchAll(), 'n', 'd');
    };
    $since = gmdate('Y-m-d', time() - ($days - 1) * 86400);
    $act = $by("SELECT day d, COUNT(*) n FROM activity_days WHERE day >= '$since' GROUP BY day");
    $sig = $by("SELECT DATE(created_at) d, COUNT(*) n FROM profiles WHERE created_at >= '$since' GROUP BY DATE(created_at)");
    $pos = $by("SELECT DATE(created_at) d, COUNT(*) n FROM posts WHERE created_at >= '$since' GROUP BY DATE(created_at)");
    $msg = $by("SELECT DATE(created_at) d, COUNT(*) n FROM messages WHERE created_at >= '$since' GROUP BY DATE(created_at)");
    $list = [];
    for ($i = $days - 1; $i >= 0; $i--) {
        $d = gmdate('Y-m-d', time() - $i * 86400);
        $list[] = ['day' => $d, 'active' => (int) ($act[$d] ?? 0), 'signups' => (int) ($sig[$d] ?? 0), 'posts' => (int) ($pos[$d] ?? 0), 'messages' => (int) ($msg[$d] ?? 0)];
    }
    $top = array_map(fn($r) => ['user_id' => $r['user_id'], 'n' => (int) $r['n']], q('SELECT user_id, COUNT(*) n FROM posts WHERE created_at > UTC_TIMESTAMP(3) - INTERVAL 7 DAY GROUP BY user_id ORDER BY n DESC LIMIT 5')->fetchAll());
    return [
        'days' => $list,
        'top' => $top,
        'totals' => [
            'users' => (int) qv('SELECT COUNT(*) FROM profiles'),
            'active7' => (int) qv('SELECT COUNT(DISTINCT user_id) FROM activity_days WHERE day > UTC_DATE() - INTERVAL 7 DAY'),
            'posts' => (int) qv('SELECT COUNT(*) FROM posts'),
            'messages' => (int) qv('SELECT COUNT(*) FROM messages'),
        ],
    ];
}

/** Kilit ekranından "Reddet" (oturumsuz; arama numarasını bilen reddedebilir). */
function rpc_decline_call(string $cid)
{
    global $PUSH;
    if (!is_uuid($cid)) return null;
    $c = q1("SELECT * FROM calls WHERE id = ? AND status = 'ringing'", [$cid]);
    if (!$c) return null;
    q("UPDATE calls SET status = 'declined', ended_at = ? WHERE id = ? AND status = 'ringing'", [now_db(), $cid]);
    $n = q1('SELECT * FROM calls WHERE id = ?', [$cid]);
    log_change('calls', $n, 'UPDATE');
    $PUSH[] = ['calls', 'UPDATE', $n];
    return null;
}

/** Hesabımı sil (kurucu silinemez). Dosyaları da siler. */
function op_delete_account(): void
{
    global $ME, $MEP;
    need_auth();
    if ($MEP['role'] === 'owner' && (int) qv('SELECT COUNT(*) FROM profiles') > 1) fail('Kurucu hesabı silinemez.');
    delete_user_files($ME);
    q('DELETE FROM accounts WHERE id = ?', [$ME]);
}
