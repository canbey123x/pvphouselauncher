<?php
// =========================================================
// Kanka API — telefon bildirimleri (Firebase Cloud Messaging, HTTP v1).
// Ayar: config.php > fcm_service_account (Firebase hizmet hesabı JSON'unun tamamı).
// Yanıt gönderildikten sonra çalışır, uygulamayı bekletmez.
// =========================================================

function fcm_sa(): ?array
{
    $sa = cfg('fcm_service_account');
    if (is_string($sa)) $sa = json_decode($sa, true);
    return is_array($sa) && !empty($sa['client_email']) && !empty($sa['private_key']) ? $sa : null;
}
function b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}
function fcm_token(array $sa): ?string
{
    $cache = __DIR__ . '/.cache/fcm.json';
    if (is_file($cache)) {
        $c = json_decode((string) file_get_contents($cache), true);
        if ($c && $c['exp'] > time() + 60) return $c['token'];
    }
    $now = time();
    $head = b64u(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claim = b64u(json_encode(['iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/firebase.messaging', 'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600]));
    $sig = '';
    if (!openssl_sign("$head.$claim", $sig, $sa['private_key'], OPENSSL_ALGO_SHA256)) return null;
    $res = http_post('https://oauth2.googleapis.com/token', http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => "$head.$claim." . b64u($sig)]), ['Content-Type: application/x-www-form-urlencoded']);
    $j = json_decode($res[1], true);
    if (empty($j['access_token'])) return null;
    @mkdir(__DIR__ . '/.cache', 0700, true);
    @file_put_contents($cache, json_encode(['token' => $j['access_token'], 'exp' => $now + (int) ($j['expires_in'] ?? 3600)]));
    return $j['access_token'];
}
function http_post(string $url, string $body, array $headers): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8]);
    $r = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return [$code, $r];
}

/** Kullanıcıların bütün telefonlarına "data" mesajı. */
function fcm_send(array $userIds, array $data, string $ttl = '86400s'): void
{
    $sa = fcm_sa();
    $userIds = array_values(array_unique(array_filter($userIds)));
    if (!$sa || !$userIds) return;
    $in = implode(',', array_map(fn($x) => db()->quote($x), $userIds));
    $tokens = q("SELECT token FROM device_tokens WHERE user_id IN ($in)")->fetchAll(PDO::FETCH_COLUMN);
    if (!$tokens) return;
    $at = fcm_token($sa);
    if (!$at) return;
    $data = array_map('strval', $data);
    foreach ($tokens as $tok) {
        [$code, $res] = http_post("https://fcm.googleapis.com/v1/projects/{$sa['project_id']}/messages:send", json_encode(['message' => ['token' => $tok, 'data' => $data, 'android' => ['priority' => 'high', 'ttl' => $ttl]]]), ["Authorization: Bearer $at", 'Content-Type: application/json']);
        if ($code === 404 || str_contains($res, 'UNREGISTERED') || ($code === 400 && str_contains($res, 'INVALID_ARGUMENT'))) q('DELETE FROM device_tokens WHERE token = ?', [$tok]);
    }
}

const PUSH_TXT = [
    'like' => 'gönderini beğendi', 'comment' => 'yorum yaptı', 'follow' => 'seni takip etmeye başladı', 'follow_request' => 'seni takip etmek istiyor',
    'follow_accept' => 'takip isteğini kabul etti', 'repost' => 'gönderini repost etti', 'tag' => 'seni bir gönderide etiketledi', 'mention' => 'senden bahsetti',
    'group_add' => 'seni bir gruba ekledi', 'story_vote' => 'hikâyene cevap verdi', 'missed_call' => 'seni aradı (cevapsız arama)', 'live' => 'canlı yayında',
    'group_call' => 'grup araması başlattı', 'invite' => "davetinle Kanka'ya katıldı",
];
function clip(string $s, int $n = 120): string
{
    return mb_strlen($s) > $n ? mb_substr($s, 0, $n - 1) . '…' : $s;
}

/** Yazma sonrası biriken bildirimleri gönder. */
function run_push(array $jobs): void
{
    if (!$jobs || !fcm_sa()) return;
    foreach ($jobs as [$t, $ev, $r]) {
        try {
            push_one($t, $ev, $r);
        } catch (Throwable $e) {
            error_log('kanka push: ' . $e->getMessage());
        }
    }
}
function uname_of(?string $id): string
{
    return $id ? (string) qv('SELECT username FROM profiles WHERE id = ?', [$id]) : '';
}
function push_one(string $t, string $ev, array $r): void
{
    if ($t === 'notifications') {
        $actor = uname_of($r['actor_id']);
        $type = $r['type'];
        $body = in_array($type, ['verified', 'system'], true) || !$actor ? ($r['text'] ?: 'Yeni bildirim') : "@$actor " . (PUSH_TXT[$type] ?? '') . ($r['text'] && $type !== 'missed_call' ? ': ' . clip($r['text'], 80) : '');
        fcm_send([$r['user_id']], ['type' => $type === 'missed_call' ? 'missed_call' : 'notif', 'title' => 'Kanka', 'body' => $body, 'post_id' => $r['post_id'] ?? '', 'username' => $actor, 'tag' => "n-$type-" . ($r['post_id'] ?: $r['actor_id'])]);
        return;
    }
    if ($t === 'messages') {
        $c = q1('SELECT * FROM conversations WHERE id = ?', [$r['conversation_id']]);
        if (!$c) return;
        $to = (int) $c['is_group'] ? q('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [$c['id']])->fetchAll(PDO::FETCH_COLUMN) : [$c['a'], $c['b']];
        $from = uname_of($r['sender_id']);
        $what = (int) $r['once'] ? 'Tek seferlik fotoğraf' : ($r['media_kind'] === 'audio' ? 'Sesli mesaj' : ($r['text'] !== '' ? clip(preg_replace('/::tepki:[a-z]+::/', '[tepki]', $r['text'])) : ($r['media_kind'] === 'gif' ? 'GIF' : 'Fotoğraf/video')));
        $grp = (int) $c['is_group'];
        fcm_send(array_diff($to, [$r['sender_id']]), ['type' => 'message', 'title' => $grp ? ($c['title'] ?: 'Grup') : "@$from", 'body' => $grp ? "$from: $what" : $what, 'conversation_id' => $c['id'], 'tag' => 'dm-' . $c['id']]);
        return;
    }
    if ($t === 'calls') {
        if ($ev === 'INSERT' && $r['status'] === 'ringing') {
            $p = q1('SELECT username, name, avatar FROM profiles WHERE id = ?', [$r['caller_id']]) ?: [];
            fcm_send([$r['callee_id']], ['type' => 'call', 'call_id' => $r['id'], 'kind' => $r['kind'], 'username' => $p['username'] ?? '', 'name' => ($p['name'] ?? '') ?: ($p['username'] ?? 'Kanka'), 'avatar' => $p['avatar'] ?? '', 'created_at' => out_row(['created_at' => $r['created_at']])['created_at']], '40s');
        } elseif ($ev === 'UPDATE' && $r['status'] !== 'ringing') {
            fcm_send([$r['callee_id']], ['type' => 'call_end', 'call_id' => $r['id'], 'status' => $r['status']], '60s');
        }
        return;
    }
    if ($t === 'group_calls') {
        $c = q1('SELECT title FROM conversations WHERE id = ?', [$r['conversation_id']]);
        $to = q('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [$r['conversation_id']])->fetchAll(PDO::FETCH_COLUMN);
        fcm_send(array_diff($to, [$r['started_by']]), ['type' => 'group_call', 'group_call_id' => $r['id'], 'conversation_id' => $r['conversation_id'], 'kind' => $r['kind'], 'name' => ($c['title'] ?? '') ?: 'Grup', 'username' => uname_of($r['started_by']), 'created_at' => out_row(['created_at' => $r['created_at']])['created_at']], '40s');
        return;
    }
    if ($t === 'lives') {
        $fol = q('SELECT follower_id FROM follows WHERE following_id = ?', [$r['user_id']])->fetchAll(PDO::FETCH_COLUMN);
        fcm_send($fol, ['type' => 'live', 'live_id' => $r['id'], 'title' => 'Kanka', 'body' => '@' . uname_of($r['user_id']) . ' canlı yayında' . ($r['title'] ? ': ' . clip($r['title'], 60) : ''), 'tag' => 'live-' . $r['user_id']], '3600s');
    }
}
